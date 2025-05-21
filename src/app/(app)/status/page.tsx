import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Edit3 } from "lucide-react";
import Image from "next/image";

const myStatus = {
  avatar: "https://placehold.co/100x100.png",
  dataAiHint: "man portrait",
  time: "Tap to add status update",
};

const recentUpdates = [
  { id: "1", name: "Mom", avatar: "https://placehold.co/100x100.png", time: "15 minutes ago", dataAiHint: "woman smiling" },
  { id: "2", name: "John (Brother)", avatar: "https://placehold.co/100x100.png", time: "1 hour ago", dataAiHint: "man happy" },
];

const viewedUpdates = [
  { id: "3", name: "Grandma", avatar: "https://placehold.co/100x100.png", time: "Today, 9:30 AM", dataAiHint: "grandmother" },
];

export default function StatusPage() {
  return (
    <div className="flex flex-col h-full">
      <CardHeader className="px-0 py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl">Status</CardTitle>
          {/* Placeholder for more options if needed */}
        </div>
      </CardHeader>

      <div className="flex-1 overflow-y-auto -mx-4 sm:-mx-6 lg:-mx-8">
        {/* My Status */}
        <Card className="mb-2 shadow-none border-0 rounded-none hover:bg-secondary/50 cursor-pointer">
          <CardContent className="p-3 flex items-center space-x-3">
            <div className="relative">
              <Avatar className="h-12 w-12">
                <AvatarImage src={myStatus.avatar} alt="My Status" data-ai-hint={myStatus.dataAiHint} />
                <AvatarFallback>ME</AvatarFallback>
              </Avatar>
              <Button variant="outline" size="icon" className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-2 border-background bg-muted hover:bg-muted/80">
                <Edit3 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
            <div className="flex-1">
              <p className="font-semibold">My Status</p>
              <p className="text-sm text-muted-foreground">{myStatus.time}</p>
            </div>
          </CardContent>
        </Card>

        {/* Recent Updates */}
        {recentUpdates.length > 0 && (
          <div className="py-2">
            <h3 className="px-3 text-sm font-medium text-muted-foreground mb-1">Recent updates</h3>
            {recentUpdates.map((status) => (
              <Card key={status.id} className="mb-1 shadow-none border-0 rounded-none hover:bg-secondary/50 cursor-pointer">
                <CardContent className="p-3 flex items-center space-x-3">
                  <Avatar className="h-12 w-12 border-2 border-primary">
                    <AvatarImage src={status.avatar} alt={status.name} data-ai-hint={status.dataAiHint} />
                    <AvatarFallback>{status.name.substring(0,1)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">{status.name}</p>
                    <p className="text-sm text-muted-foreground">{status.time}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Viewed Updates */}
        {viewedUpdates.length > 0 && (
          <div className="py-2">
            <h3 className="px-3 text-sm font-medium text-muted-foreground mb-1">Viewed updates</h3>
            {viewedUpdates.map((status) => (
              <Card key={status.id} className="mb-1 shadow-none border-0 rounded-none hover:bg-secondary/50 cursor-pointer">
                <CardContent className="p-3 flex items-center space-x-3">
                  <Avatar className="h-12 w-12 border-2 border-border">
                     <AvatarImage src={status.avatar} alt={status.name} data-ai-hint={status.dataAiHint} />
                    <AvatarFallback>{status.name.substring(0,1)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">{status.name}</p>
                    <p className="text-sm text-muted-foreground">{status.time}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      <div className="fixed bottom-20 right-6 md:bottom-6 md:right-6 z-20 flex flex-col space-y-3">
        <Button variant="outline" size="icon" className="rounded-full h-12 w-12 shadow-lg bg-muted hover:bg-muted/80">
          <Edit3 className="h-5 w-5 text-foreground" />
          <span className="sr-only">New text status</span>
        </Button>
         <Button size="icon" className="rounded-full h-14 w-14 shadow-lg bg-primary hover:bg-primary/90">
          <Camera className="h-6 w-6 text-primary-foreground" />
           <span className="sr-only">New photo/video status</span>
        </Button>
      </div>
    </div>
  );
}
