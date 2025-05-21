"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { Camera, Edit2, Mail, Phone, Shield, UserCircle2 } from "lucide-react";
import Image from "next/image";

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) {
    return <p>Loading profile...</p>; 
  }

  const getInitials = (name?: string | null) => {
    if (!name) return "FC";
    const names = name.split(" ");
    if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
  };
  
  return (
    <div className="space-y-6">
      <CardHeader className="px-0 py-4">
        <CardTitle className="text-2xl">Profile</CardTitle>
        <CardDescription>Manage your account information and settings.</CardDescription>
      </CardHeader>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <Avatar className="h-32 w-32">
                <AvatarImage src={user.photoURL || "https://placehold.co/200x200.png"} alt={user.displayName || "User"} data-ai-hint="person portrait" />
                <AvatarFallback className="text-4xl">{getInitials(user.displayName)}</AvatarFallback>
              </Avatar>
              <Button variant="outline" size="icon" className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full border-2 border-background bg-card">
                <Camera className="h-5 w-5" />
                 <span className="sr-only">Change Photo</span>
              </Button>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-semibold">{user.displayName || "Anonymous User"}</h2>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
             <Button variant="outline">
                <Edit2 className="mr-2 h-4 w-4" /> Edit Profile
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-3 p-3 rounded-md hover:bg-muted/50 cursor-pointer">
            <UserCircle2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p>{user.displayName || "Not set"}</p>
            </div>
            <Edit2 className="h-4 w-4 ml-auto text-muted-foreground hover:text-primary"/>
          </div>
          <div className="flex items-center space-x-3 p-3 rounded-md hover:bg-muted/50 cursor-pointer">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p>{user.email}</p>
            </div>
          </div>
           <div className="flex items-center space-x-3 p-3 rounded-md hover:bg-muted/50 cursor-pointer">
            <Phone className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p>{user.phoneNumber || "Not set"}</p>
            </div>
            <Edit2 className="h-4 w-4 ml-auto text-muted-foreground hover:text-primary"/>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent>
           <div className="flex items-center space-x-3 p-3 rounded-md hover:bg-muted/50 cursor-pointer">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm">Change Password</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
